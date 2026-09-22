import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { ArquivosService, RegraDoArquivo } from '../../kernel/arquivos/arquivos.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { formatCpf, isValidCpf, maskCpf, normalizeCpf } from '../../kernel/common/cpf';
import { DIAS_DA_SEMANA, diasEmPortugues } from '../../kernel/common/semana';

/** Quem ESCREVE no cadastro de contatos — e quem autoriza visita (fase 92). */
export const ESCREVE_CONTATO = ['equipe_tecnica', 'coordenador', 'gestor_geral'];

export const VINCULOS_DO_CONTATO = [
  { code: 'genitora', label: 'Genitora' },
  { code: 'genitor', label: 'Genitor' },
  { code: 'irmao', label: 'Irmão ou irmã' },
  { code: 'avo', label: 'Avó ou avô' },
  { code: 'tio', label: 'Tia ou tio' },
  { code: 'padrinho', label: 'Padrinho' },
  { code: 'madrinha', label: 'Madrinha' },
  { code: 'vinculo_comunitario', label: 'Vínculo comunitário' },
  { code: 'servico_da_rede', label: 'Serviço da rede' },
  { code: 'outro', label: 'Outro' },
];

/**
 * O CONTATO COMO A TELA LÊ — um lugar só (fase 92).
 *
 * O perfil tinha consulta e forma próprias, e devolvia as linhas cruas do
 * banco: contra o servidor de verdade a seção de contatos saía vazia, porque a
 * tela filtra por `ativo` e lê `nome`. Colunas e forma moram aqui, e a lista de
 * contatos e o perfil usam as duas.
 */
export const COLUNAS_DO_CONTATO = `id, name, bond, bond_other, phone, note, restricted, restriction_note,
       active, ended_reason, cpf, visit_authorized, visit_authorized_at,
       visit_weekdays, visit_from, visit_to, visit_note,
       app_user_display_name(visit_authorized_by) AS autorizado_por,
       photo_key IS NOT NULL AS tem_foto,
       app_user_display_name(created_by) AS por, created_at`;

export function contatoParaTela(r: any, papel: string) {
  /*
   * O CPF é de TERCEIRO. Inteiro só para quem escreve no cadastro; o educador,
   * que lê os contatos para saber quem aparece no portão, vê os três dígitos
   * do meio — o bastante para conferir um documento, pouco para copiar.
   */
  const inteiro = ESCREVE_CONTATO.includes(papel);
  return {
    id: r.id, nome: r.name,
    vinculo: r.bond,
    vinculoRotulo: rotuloDoVinculo(r.bond, r.bond_other),
    telefone: r.phone, observacao: r.note,
    restrito: r.restricted, motivoDaRestricao: r.restriction_note,
    ativo: r.active, motivoDoEncerramento: r.ended_reason,
    cpf: r.cpf ? (inteiro ? formatCpf(r.cpf) : maskCpf(r.cpf)) : null,
    autorizadoAVisitar: r.visit_authorized,
    autorizacao: r.visit_authorized ? { por: r.autorizado_por, em: r.visit_authorized_at } : null,
    /*
     * QUANDO ELE PODE VIR (1500).
     *
     * Sai para TODO contato, e não só para o autorizado, porque a técnica combina
     * o horário ANTES de marcar a autorização — e se o campo só aparecesse depois
     * ela teria de autorizar primeiro para poder combinar, o que inverte a ordem
     * dos atos. `dias` vem também escrito em português: quem lê a lista no
     * celular às 20h não conta números de dia da semana.
     */
    visita: {
      dias: (r.visit_weekdays ?? null) as number[] | null,
      diasEscritos: diasEmPortugues(r.visit_weekdays),
      de: r.visit_from, ate: r.visit_to,
      observacao: r.visit_note,
      combinado: Boolean(r.visit_weekdays && r.visit_from),
    },
    temFoto: r.tem_foto,
    por: r.por, em: r.created_at,
  };
}

export function rotuloDoVinculo(bond: string, outro?: string | null): string {
  return bond === 'outro' ? (outro ?? 'Outro')
    : (VINCULOS_DO_CONTATO.find((v) => v.code === bond)?.label ?? bond);
}

/**
 * A FOTO DE IDENTIFICAÇÃO E OS TELEFONES DE QUEM APARECE.
 *
 * Os dois vêm da lista que a equipe técnica mantém à mão — um documento de
 * texto com as vinte crianças da casa, reenviado inteiro toda vez que uma
 * linha muda. Ele traz, por criança, a filiação, os documentos e os telefones
 * da mãe, do padrinho, da tia e do vínculo comunitário. É esse arquivo solto
 * que este módulo existe para aposentar.
 *
 * **A foto é de identificação, e não é retrato.** A casa recebe vinte
 * crianças, o plantão troca a cada doze horas, e entra gente nova toda semana.
 * A coordenação decidiu em 03/09/2026 que ela não depende de autorização de
 * imagem: serve para a equipe saber quem é quem, e se sair num documento é
 * para o Juízo, que responde pela proteção da criança tanto quanto a casa.
 * Mesmo assim ela NÃO entra em documento nenhum por padrão — quem a quiser
 * numa folha vai ter que pedir, e aí a decisão é de quem pede.
 *
 * **Os contatos são do educador também.** Foi a outra decisão do mesmo dia:
 * quem está com a criança precisa saber quem é a madrinha que aparece no
 * portão. Escrever no cadastro continua sendo da técnica e da coordenação.
 */
/**
 * AS DUAS FOTOS — 4 MB, e SÓ IMAGEM.
 *
 * A regra é mais estreita que a do kernel de propósito, e a diferença tem
 * motivo: um PDF como retrato de uma criança não é documento, é engano — e a
 * folha da portaria desenha a foto num quadro 3×4, onde um PDF não entra.
 * Quatro megabytes é o que uma foto de celular pesa; o dossiê aceita quinze
 * porque lá cabe uma certidão digitalizada de dez páginas.
 */
const A_FOTO: RegraDoArquivo = {
  aceita: ['image/jpeg', 'image/png', 'image/webp'],
  maximo: 4 * 1024 * 1024,
  recusas: {
    vazio: 'A foto chegou vazia.',
    grande: 'A foto passa de 4 MB. A do celular costuma resolver.',
    tipo: 'Envie uma foto em JPG, PNG ou WEBP.',
  },
};

@Injectable()
export class ContatosService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ArquivosService) private readonly arquivos: ArquivosService,
  ) {}

  private readonly VINCULOS = VINCULOS_DO_CONTATO;

  vocabulario() {
    return {
      vinculos: this.VINCULOS,
      /*
       * A frase que a tela mostra sobre a ordem. O vínculo é um RÓTULO e não
       * uma hierarquia: em várias dessas histórias, quem aparece é a
       * madrinha, e não a genitora.
       */
      nota: 'O vínculo diz quem é, não quem vale mais. Contato com aproximação '
        + 'suspensa entra marcado, com o motivo — quem descobre isso às 23h descobre tarde.',
      /* Os dias vêm do kernel: a mesma numeração da rotina da casa (1500). */
      dias: DIAS_DA_SEMANA,
      notaDaVisita: 'O dia e a hora são deste visitante, e não da casa: a avó que vem de '
        + 'ônibus vem no sábado de manhã, e o padrinho que trabalha vem à noite. Sai '
        + 'impresso na folha da guarita — quem está no portão às 21h de uma terça precisa '
        + 'dele para não ter de escolher entre barrar um familiar autorizado e deixar '
        + 'entrar quem não é da hora.',
    };
  }

  // ------------------------------------------------------------- Contatos

  async listar(user: AuthenticatedUser, personId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT ${COLUNAS_DO_CONTATO}
           FROM person_contact WHERE person_id = $1
          ORDER BY active DESC, restricted DESC, name`, [personId]);
      return rows.map((r) => contatoParaTela(r, user.role));
    });
  }


  async criar(user: AuthenticatedUser, personId: string, input: {
    nome?: string; vinculo?: string; vinculoOutro?: string; telefone?: string;
    observacao?: string; restrito?: boolean; motivoDaRestricao?: string; cpf?: string;
  }) {
    const cpf = this.cpfOuNulo(input.cpf);
    if (!(input.nome ?? '').trim()) {
      throw new BadRequestException('Escreva o nome de quem é este contato.');
    }
    if (!this.VINCULOS.some((v) => v.code === input.vinculo)) {
      throw new BadRequestException('Informe o vínculo desta pessoa com o acolhido.');
    }
    if (input.vinculo === 'outro' && !(input.vinculoOutro ?? '').trim()) {
      throw new BadRequestException('Em "outro", escreva qual é o vínculo.');
    }
    /*
     * Restrição sem motivo não entra. Um telefone marcado como "não acionar",
     * sem dizer por quê, vira uma proibição que ninguém sabe se ainda vale — e
     * a educadora de plantão fica sem saber se pode chamar a avó às duas da
     * manhã.
     */
    if (input.restrito && (input.motivoDaRestricao ?? '').trim().length < 10) {
      throw new BadRequestException(
        'Escreva por que este contato tem aproximação restrita. Quem ler às 23h '
        + 'precisa saber se ainda vale.');
    }

    return this.db.asUser(user.id, async (c) => {
      try {
        const { rows: [r] } = await c.query(
          `INSERT INTO person_contact (person_id, name, bond, bond_other, phone, note,
                                       restricted, restriction_note, cpf, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$10,$9,$9) RETURNING id`,
          [personId, input.nome!.trim(), input.vinculo,
           input.vinculo === 'outro' ? input.vinculoOutro!.trim() : null,
           (input.telefone ?? '').trim() || null, (input.observacao ?? '').trim() || null,
           !!input.restrito, input.restrito ? input.motivoDaRestricao!.trim() : null,
           user.id, cpf]);
        await this.audit.log({
          action: 'contato.criado', actorId: user.id, institutionId: user.institutionId,
          houseId: await this.audit.casaDoAcolhido(user.id, personId, c),
          entity: 'person_contact', entityId: r.id,
          // Metadado, nunca conteúdo: o vínculo, e não o nome nem o telefone.
          detail: { vinculo: input.vinculo, restrito: !!input.restrito },
        });
        return { id: r.id, ok: true };
      } catch (e: any) {
        if (String(e?.message ?? '').includes('violates row-level security')) {
          throw new ForbiddenException(
            'Escrever no cadastro de contatos é da equipe técnica e da coordenação.');
        }
        throw e;
      }
    });
  }

  /**
   * Encerra um contato. Não apaga: o telefone que deixou de valer é
   * informação — alguém tentou por ele e não conseguiu.
   */
  async encerrar(user: AuthenticatedUser, contatoId: string, motivo: string) {
    if ((motivo ?? '').trim().length < 5) {
      throw new BadRequestException('Escreva por que este contato não vale mais.');
    }
    return this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE person_contact SET active = false, ended_reason = $2,
                visit_authorized = false,
                updated_at = now(), updated_by = $3
          WHERE id = $1 AND active`, [contatoId, motivo.trim(), user.id]);
      if (!rowCount) throw new NotFoundException('Contato não encontrado — ou já encerrado.');
      return { ok: true };
    });
  }

  /** CPF opcional: vazio vira nulo; preenchido tem de ser um CPF de verdade. */
  private cpfOuNulo(bruto?: string | null): string | null {
    const limpo = normalizeCpf(bruto ?? '');
    if (!limpo) return null;
    if (!isValidCpf(limpo)) {
      throw new BadRequestException(
        'Este CPF não confere — os dígitos verificadores não batem. Confira no documento.');
    }
    return limpo;
  }

  // ------------------------------------------------- Autorizado a visitar

  /**
   * A MARCA DE QUEM PODE VISITAR (fase 92), com o CPF junto.
   *
   * É um ato separado de criar o contato, de propósito: a auditoria registra
   * QUEM autorizou e quando, e é essa pessoa que responde se alguém entrou na
   * casa por causa da folha da guarita.
   */
  async definirVisita(user: AuthenticatedUser, contatoId: string, input: {
    autorizado?: boolean; cpf?: string; motivo?: string;
    dias?: number[]; de?: string; ate?: string; observacao?: string;
  }) {
    if (!ESCREVE_CONTATO.includes(user.role)) {
      throw new ForbiddenException(
        'Autorizar visita é da equipe técnica e da coordenação — é quem responde por quem entra.');
    }
    if (typeof input.autorizado !== 'boolean') {
      throw new BadRequestException('Diga se este contato está autorizado a visitar ou não.');
    }
    const cpf = input.cpf === undefined ? undefined : this.cpfOuNulo(input.cpf);
    const janela = this.janelaDaVisita(input);

    /*
     * RETIRAR PEDE MOTIVO (1500), e AUTORIZAR não pede.
     *
     * A autorização já é o ato, e a 1120 guarda quem a deu. A retirada é o que
     * alguém vai perguntar depois: a família chega ao portão, ouve "não está na
     * folha", e se ninguém escreveu o porquê não há quem responda. Dez
     * caracteres é o mesmo piso do relato e do "se necessário" — "mudou" não
     * socorre a pessoa que está no portão.
     */
    const motivo = (input.motivo ?? '').trim();
    if (!input.autorizado && motivo.length < 10) {
      throw new BadRequestException(
        'Escreva por que este contato sai da folha da portaria. Quem chegar ao portão '
        + 'daqui a seis meses vai ouvir "não está na folha", e é esta frase que responde.');
    }

    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [antes] } = await c.query(
        `SELECT id, person_id, bond, restricted, active, visit_authorized, visit_weekdays
           FROM person_contact WHERE id = $1`, [contatoId]);
      if (!antes) return null;
      /*
       * A leitura DIAGNOSTICA, com a frase certa; quem garante é o banco — a
       * restrição `contato_restrito_nao_visita` recusa de qualquer jeito.
       */
      if (input.autorizado && antes.restricted) {
        throw new BadRequestException(
          'Este contato tem aproximação restrita e não pode ser autorizado a visitar. '
          + 'Se a restrição deixou de valer, isso se resolve com a equipe técnica antes.');
      }
      if (input.autorizado && !antes.active) {
        throw new BadRequestException('Este contato foi encerrado. Um contato encerrado não visita.');
      }
      /*
       * E AUTORIZAR PEDE O QUANDO — mas DEPOIS da restrição e do encerramento, e
       * a regra é sobre o RESULTADO, não sobre o que veio no pedido.
       *
       * A ordem importa e eu a escrevi errada primeiro: para um contato com
       * aproximação restrita, a resposta certa é a restrição, não "falta combinar
       * o horário". Quem lê a segunda frase vai combinar o horário e tentar de
       * novo — e a recusa que interessa é a que diz que isto se resolve com a
       * equipe técnica antes. Foi a suíte da portaria, escrita na fase 92, que
       * pegou a inversão.
       *
       * Escrevi isto ao contrário na primeira versão e o teste pegou: eu exigia o
       * horário no corpo da chamada, e então REAUTORIZAR alguém pedia à técnica
       * que digitasse de novo um horário que já estava guardado — justamente o
       * caso da família cuja visita a Vara suspendeu e voltou a liberar. O que
       * tem de ser verdade é que o contato TERMINE autorizado com dia e hora, e
       * ele termina se o pedido trouxe ou se o cadastro já tinha.
       *
       * O banco continua aceitando autorização sem horário de propósito — é a
       * decisão da FOTO, na 1120: travar deixaria de fora o visitante de verdade
       * que ainda não combinou. Quem cobra é este lugar, no momento do ato.
       */
      const ficaComHorario = janela.informada ? Boolean(janela.dias) : Boolean(antes.visit_weekdays);
      if (input.autorizado && !ficaComHorario) {
        throw new BadRequestException(
          'Escolha em que dias este visitante pode vir, e a faixa de horário. '
          + 'A folha da guarita sai com isso — sem ele, quem está no portão às 21h de uma '
          + 'terça tem de escolher entre barrar um familiar autorizado e deixar entrar fora da hora.');
      }
      await c.query(
        `UPDATE person_contact
            SET visit_authorized = $2,
                visit_authorized_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
                visit_authorized_at = CASE WHEN $2 THEN now() ELSE NULL END,
                cpf = CASE WHEN $4::boolean THEN $5 ELSE cpf END,
                visit_weekdays = CASE WHEN $6::boolean THEN $7::smallint[] ELSE visit_weekdays END,
                visit_from     = CASE WHEN $6::boolean THEN $8::time     ELSE visit_from END,
                visit_to       = CASE WHEN $6::boolean THEN $9::time     ELSE visit_to END,
                visit_note     = CASE WHEN $6::boolean THEN $10          ELSE visit_note END,
                updated_at = now(), updated_by = $3
          WHERE id = $1`,
        [contatoId, input.autorizado, user.id, cpf !== undefined, cpf ?? null,
         janela.informada, janela.dias, janela.de, janela.ate, janela.observacao]);
      /*
       * A LINHA DO HISTÓRICO, e ela é o coração desta fase. Append-only: a
       * retirada de hoje não apaga a de março, e um contato pode ser retirado,
       * reautorizado e retirado de novo — a primeira é justamente a que explica
       * a história. O motivo NÃO vai para a auditoria: ele conta algo sobre uma
       * família, e log não copia conteúdo sensível (§5).
       */
      await c.query(
        `INSERT INTO contact_visit_change (contact_id, person_id, authorized, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [contatoId, antes.person_id, input.autorizado, motivo || null, user.id]);
      return antes;
    });
    if (!r) throw new NotFoundException('Contato não encontrado — ou fora do seu alcance.');

    await this.audit.log({
      action: input.autorizado ? 'contato.visita.autorizada' : 'contato.visita.retirada',
      actorId: user.id, institutionId: user.institutionId,
      houseId: await this.audit.casaDoAcolhido(user.id, r.person_id),
      entity: 'person_contact', entityId: contatoId,
      // Metadado: o vínculo, se o CPF mudou e se o horário foi combinado. Nunca
      // o CPF, e nunca o MOTIVO — a frase é sobre uma família.
      detail: { vinculo: r.bond, cpfInformado: cpf !== undefined && cpf !== null,
                horarioCombinado: janela.informada },
    });
    return {
      ok: true,
      aviso: input.autorizado
        ? 'Autorizado a visitar, com o dia e a hora combinados. Ele entra na próxima folha '
          + 'da portaria que for gerada — a que está na guarita não muda sozinha.'
        : 'Autorização retirada, com o motivo registrado. Gere uma folha nova para a '
          + 'portaria: a impressa ainda tem o nome.',
    };
  }

  /**
   * O DIA E A HORA, conferidos antes de chegarem ao banco.
   *
   * `informada` distingue "não mexeu no horário" de "apagou o horário" — sem
   * isso, retirar a autorização de alguém limparia o horário que a técnica
   * combinou, e reautorizar amanhã pediria tudo de novo.
   */
  private janelaDaVisita(input: { dias?: number[]; de?: string; ate?: string; observacao?: string }) {
    const informada = input.dias !== undefined || input.de !== undefined
      || input.ate !== undefined || input.observacao !== undefined;
    if (!informada) {
      return { informada: false, dias: null as number[] | null, de: null, ate: null, observacao: null };
    }
    const dias = Array.isArray(input.dias)
      ? [...new Set(input.dias.map((d) => Number(d)))].sort((a, b) => a - b) : [];
    if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new BadRequestException('Dia de visita fora da semana — escolha de domingo a sábado.');
    }
    const hora = (v?: string) => {
      const s = String(v ?? '').trim();
      if (!s) return null;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) {
        throw new BadRequestException('Escreva a hora como 14:00.');
      }
      return s;
    };
    const de = hora(input.de); const ate = hora(input.ate);
    if ((de === null) !== (ate === null)) {
      throw new BadRequestException(
        'A faixa de visita é inteira: hora de início E de fim. Só o começo não diz nada a '
        + 'quem está na guarita.');
    }
    if (de && ate && de >= ate) {
      throw new BadRequestException('A visita termina depois de começar — confira as duas horas.');
    }
    if (dias.length > 0 && !de) {
      throw new BadRequestException('Escolha também a faixa de horário desses dias.');
    }
    if (dias.length === 0 && de) {
      throw new BadRequestException('Escolha em que dias vale essa faixa de horário.');
    }
    return {
      informada: true,
      dias: dias.length ? dias : null,
      de, ate,
      observacao: (input.observacao ?? '').trim() || null,
    };
  }

  /**
   * O HISTÓRICO DA FOLHA — quem entrou, quem saiu e por quê (1500).
   *
   * Lido pelos três que respondem por quem entra na casa; a RLS da tabela é que
   * decide, e não esta função. Para o educador a lista volta vazia, e é decisão:
   * o motivo de alguém ter saído da folha é um juízo sobre um familiar, e
   * espalhá-lo pelo plantão inteiro muda o que a técnica se sente à vontade
   * para escrever — frase que não se escreve não protege ninguém.
   */
  async historicoDaVisita(user: AuthenticatedUser, contatoId: string) {
    return this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT v.id, v.authorized, v.reason, v.changed_at,
                app_user_display_name(v.changed_by) AS por
           FROM contact_visit_change v
          WHERE v.contact_id = $1
          ORDER BY v.changed_at DESC`, [contatoId]);
      return rows.map((r) => ({
        id: r.id,
        autorizado: r.authorized,
        motivo: r.reason,
        por: r.por,
        em: r.changed_at,
      }));
    });
  }

  // ----------------------------------------------------------------- Foto

  /**
   * A mesma conferência para as duas fotos — hoje feita pelo kernel, com a
   * regra deste lugar (fase 114). A decodificação, a medida, a leitura da
   * assinatura e a gravação moram num arquivo só; o que continua sendo daqui
   * é O QUE se aceita, e a frase com que se recusa.
   */
  private async guardarAFoto(input: { conteudo?: string }) {
    const guardado = await this.arquivos.guardar(input.conteudo, A_FOTO);
    if (!guardado) throw new BadRequestException('Nenhuma foto foi enviada.');
    return guardado;
  }

  /**
   * A FOTO 3×4 DO VISITANTE (fase 92). Opcional: a folha sai sem ela, com o
   * espaço marcado. Guardada como a do acolhido, e pelas mesmas pessoas.
   */
  async guardarFotoDoContato(user: AuthenticatedUser, contatoId: string, input: { conteudo?: string }) {
    if (!ESCREVE_CONTATO.includes(user.role)) {
      throw new ForbiddenException('A foto do visitante é cadastrada pela técnica ou pela coordenação.');
    }
    const { chave, mime: tipo, tamanho } = await this.guardarAFoto(input);
    /* De quem é este visitante: a casa da linha de auditoria vem da criança. */
    const deQuem = await this.db.asUser(user.id, async (c) => {
      const { rowCount, rows } = await c.query(
        `UPDATE person_contact SET photo_key = $2, photo_mime = $3, photo_at = now(), photo_by = $4
          WHERE id = $1 AND active RETURNING person_id`, [contatoId, chave, tipo, user.id]);
      if (!rowCount) throw new NotFoundException('Contato não encontrado, encerrado, ou fora do seu alcance.');
      return rows[0].person_id as string;
    });
    await this.audit.log({
      action: 'foto.contato.guardada', actorId: user.id, institutionId: user.institutionId,
      houseId: await this.audit.casaDoAcolhido(user.id, deQuem),
      entity: 'person_contact', entityId: contatoId, detail: { tipo, bytes: tamanho },
    });
    return { ok: true, aviso: tipo === 'image/webp'
      ? 'Foto guardada. Ela está em WEBP, que o Word não imprime: na folha da portaria sai o '
        + 'espaço marcado. Uma foto em JPG ou PNG resolve.'
      : 'Foto guardada. Ela entra na próxima folha da portaria.' };
  }

  async lerFotoDoContato(user: AuthenticatedUser, contatoId: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [x] } = await c.query(
        `SELECT photo_key, photo_mime FROM person_contact WHERE id = $1`, [contatoId]);
      return x;
    });
    if (!r) throw new NotFoundException('Contato não encontrado — ou fora do seu alcance.');
    if (!r.photo_key) throw new NotFoundException('Este contato ainda não tem foto.');
    const bytes = await this.arquivos.ler(r.photo_key);
    if (!bytes) throw new NotFoundException('A foto não está no armazenamento.');
    return { nome: 'visitante', tipo: r.photo_mime, conteudo: bytes.toString('base64') };
  }

  /** Bytes de uma foto guardada — só para quem monta a folha, dentro do módulo. */
  async bytesDaFoto(chave: string | null): Promise<Buffer | null> {
    if (!chave) return null;
    return this.arquivos.ler(chave);
  }

  async guardarFoto(user: AuthenticatedUser, personId: string, input: {
    conteudo?: string; nomeArquivo?: string;
  }) {
    if (!['equipe_tecnica', 'coordenador', 'gestor_geral'].includes(user.role)) {
      throw new ForbiddenException('A foto de identificação é cadastrada pela técnica ou pela coordenação.');
    }
    /*
     * O tipo vem da ASSINATURA do arquivo, e não da extensão: renomear é um
     * toque, e quem guarda arquivo de criança confere os primeiros bytes.
     */
    const { chave, mime: tipo, tamanho } = await this.guardarAFoto(input);

    await this.db.asUser(user.id, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE person SET photo_key = $2, photo_mime = $3, photo_at = now(), photo_by = $4
          WHERE id = $1`, [personId, chave, tipo, user.id]);
      if (!rowCount) throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
    });

    await this.audit.log({
      action: 'foto.identificacao.guardada', actorId: user.id,
      institutionId: user.institutionId,
      houseId: await this.audit.casaDoAcolhido(user.id, personId),
      entity: 'person', entityId: personId,
      detail: { tipo, bytes: tamanho },
    });
    return { ok: true, aviso: 'Foto de identificação guardada. Ela aparece no alto do perfil '
      + 'e não entra em documento nenhum por padrão.' };
  }

  async lerFoto(user: AuthenticatedUser, personId: string) {
    const p = await this.db.asUser(user.id, async (c) => {
      const { rows: [r] } = await c.query(
        `SELECT photo_key, photo_mime FROM person WHERE id = $1`, [personId]);
      return r;
    });
    if (!p) throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
    if (!p.photo_key) throw new NotFoundException('Este acolhido ainda não tem foto.');
    const bytes = await this.arquivos.ler(p.photo_key);
    if (!bytes) throw new NotFoundException('A foto não está no armazenamento.');
    /*
     * Ver a foto NÃO é acesso registrado, e isso é escolha.
     *
     * Ela aparece no alto do perfil, e o perfil já deixa rastro. Registrar
     * cada carregamento de imagem encheria a auditoria de linhas que ninguém
     * lê, e a auditoria cheia de ruído é auditoria que não se usa quando
     * precisa.
     */
    return { nome: 'identificacao', tipo: p.photo_mime, conteudo: bytes.toString('base64') };
  }

  /** O sha da foto — para o ensaio conferir que ela é a que foi enviada. */
  static impressao(bytes: Buffer) {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
