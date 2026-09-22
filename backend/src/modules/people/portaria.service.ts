import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { formatCpf } from '../../kernel/common/cpf';
import { Folha, FotoNaCelula, cargoNoDocumento, diaBR, hhmmBR } from '../../kernel/documentos/folha';
import { ContatosService, ESCREVE_CONTATO, rotuloDoVinculo } from './contatos.service';
import { diasEmPortugues } from '../../kernel/common/semana';

/**
 * A FOLHA DA PORTARIA — quem pode visitar cada acolhido (fase 92).
 *
 * Pedido do Marcelo em 09/09. A portaria não entra no sistema, como a
 * cozinha: recebe o papel, confere quem chega, e liga para a casa quando a
 * pessoa não está nele.
 *
 * O que a folha traz, por criança: a foto de identificação dela, e cada
 * visitante AUTORIZADO com foto 3×4, nome, vínculo, CPF e telefone.
 *
 * O que ela não traz, e não vai trazer:
 *   - contato com aproximação restrita — nem como "não autorizado". A folha
 *     não diz por que alguém não está nela: numa guarita, "proibido de ver a
 *     criança" já conta uma história que não é da portaria;
 *   - motivo de restrição, observação do contato, motivo judicial, diagnóstico;
 *   - contato encerrado, e contato que ninguém autorizou.
 *
 * As fotos. A de identificação do acolhido "não entra em documento nenhum por
 * padrão — quem a quiser numa folha vai ter que pedir" (contatos.service). Esta
 * folha é o pedido, feito pelo Marcelo, e a ressalva diz isso por escrito.
 * A pré-visualização não carrega imagem; só o arquivo exportado leva as fotos.
 */
/**
 * A hora como a guarita lê. O `time` do Postgres chega "14:00:00", e o segundo
 * não diz nada a ninguém num portão — mas ocupa espaço numa folha em paisagem
 * com oito colunas.
 */
function hhmm(t: string | null): string {
  return String(t ?? '').slice(0, 5);
}

@Injectable()
export class PortariaService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
    @Inject(ContatosService) private readonly contatos: ContatosService,
  ) {}

  private conferirQuemPode(user: AuthenticatedUser) {
    if (!ESCREVE_CONTATO.includes(user.role)) {
      throw new ForbiddenException(
        'A folha da portaria é gerada pela equipe técnica ou pela coordenação — '
        + 'é quem responde por quem está autorizado nela.');
    }
  }

  async folha(user: AuthenticatedUser, houseId: string, comFotos = false): Promise<Folha> {
    this.conferirQuemPode(user);

    const dados = await this.db.asUser(user.id, async (c) => {
      /* Fora de escopo responde igual a inexistente (regra 8). */
      const { rows: [casa] } = await c.query(
        `SELECT app_house_in_scope($1) AS alcance, app_house_label($1) AS rotulo`, [houseId]);
      if (!casa?.alcance) return null;

      /*
       * rls-join-ok: person_contact responde a `contact_select`
       * (app_person_in_scope) e os três cargos que chegam aqui enxergam todos
       * os contatos das crianças da casa em alcance — a mesma casa conferida
       * acima. O LEFT JOIN é de propósito: criança SEM visitante autorizado
       * aparece na folha dizendo isso, e não some.
       */
      const { rows } = await c.query(
        `SELECT p.id AS person_id,
                coalesce(nullif(p.social_name, ''), p.full_name) AS crianca,
                p.photo_key AS foto_crianca, p.photo_mime AS tipo_crianca,
                ct.id AS contato_id, ct.name AS visitante, ct.bond, ct.bond_other,
                ct.cpf, ct.phone,
                ct.visit_weekdays, ct.visit_from, ct.visit_to, ct.visit_note,
                ct.photo_key AS foto_visitante, ct.photo_mime AS tipo_visitante
           FROM person p
           JOIN house_stay s ON s.person_id = p.id AND s.status = 'ativa'
           LEFT JOIN person_contact ct
                  ON ct.person_id = p.id AND ct.active AND ct.visit_authorized
                 AND NOT ct.restricted
          WHERE s.house_id = $1
          ORDER BY crianca, ct.name`, [houseId]);
      return { rotulo: casa.rotulo as string, rows };
    });
    if (!dados) throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');

    const linhas: string[][] = [];
    const fotos: (FotoNaCelula | null)[][] = [];
    const criancas = new Set<string>();
    let visitantes = 0;
    let semVisitante = 0;
    let visitantesSemFoto = 0;
    let semHorario = 0;

    const foto = async (chave: string | null, tipo: string | null): Promise<FotoNaCelula | null> => {
      if (!comFotos || !chave || !tipo) return null;
      const bytes = await this.contatos.bytesDaFoto(chave);
      return bytes ? { tipo, dados: bytes } : null;
    };

    for (const r of dados.rows) {
      const primeira = !criancas.has(r.person_id);
      criancas.add(r.person_id);
      /* A criança aparece uma vez, na primeira linha dela; as outras ficam em
         branco nas duas primeiras colunas, como numa planilha agrupada. */
      const colunaCrianca = primeira
        ? [r.foto_crianca ? 'foto' : 'sem foto', r.crianca]
        : ['', ''];
      const fotoCrianca = primeira ? await foto(r.foto_crianca, r.tipo_crianca) : null;

      if (!r.contato_id) {
        semVisitante++;
        linhas.push([...colunaCrianca, '', 'Nenhum visitante autorizado', '—', '—', '—', '—']);
        fotos.push([fotoCrianca, null, null, null, null, null, null, null]);
        continue;
      }
      visitantes++;
      if (!r.foto_visitante) visitantesSemFoto++;
      /*
       * O QUANDO (1500). Sem ele a folha transfere para a guarita uma decisão que
       * é da casa: quem está no portão às 21h de uma terça teria de escolher
       * entre barrar um familiar autorizado e deixar entrar fora da hora. E a
       * frase para quem AINDA não combinou não é um vazio — é uma instrução,
       * porque um traço na coluna faz o porteiro adivinhar.
       */
      if (!r.visit_weekdays || !r.visit_from) semHorario++;
      const quando = r.visit_weekdays && r.visit_from
        ? `${diasEmPortugues(r.visit_weekdays)}, das ${hhmm(r.visit_from)} às ${hhmm(r.visit_to)}`
          + (r.visit_note ? ` · ${r.visit_note}` : '')
        : 'sem dia combinado — confirme com a casa antes de deixar entrar';
      linhas.push([
        ...colunaCrianca,
        r.foto_visitante ? 'foto' : 'sem foto — pedir documento com foto',
        r.visitante,
        rotuloDoVinculo(r.bond, r.bond_other),
        quando,
        r.cpf ? formatCpf(r.cpf) : 'não cadastrado — pedir documento com foto',
        r.phone ?? '—',
      ]);
      fotos.push([fotoCrianca, null, await foto(r.foto_visitante, r.tipo_visitante),
                  null, null, null, null, null]);
    }

    const agora = new Date();
    return {
      titulo: 'Quem pode visitar',
      subtitulo: dados.rotulo,
      paisagem: true,
      identificacao: [
        { rotulo: 'Emitida em', valor: `${diaBR(agora)}, às ${hhmmBR(agora)}` },
        { rotulo: 'Crianças na casa', valor: String(criancas.size) },
        { rotulo: 'Visitantes autorizados', valor: String(visitantes) },
        ...(semVisitante
          ? [{ rotulo: 'Crianças sem visitante autorizado', valor: String(semVisitante) }] : []),
        ...(visitantesSemFoto
          ? [{ rotulo: 'Visitantes sem foto cadastrada', valor: String(visitantesSemFoto) }] : []),
        ...(semHorario
          ? [{ rotulo: 'Visitantes sem dia e hora combinados', valor: String(semHorario) }] : []),
      ],
      secoes: [{
        titulo: 'Visitantes autorizados, por criança',
        tabela: {
          cabecalho: ['Foto', 'Criança', 'Foto', 'Quem pode visitar', 'Vínculo',
                      'Quando pode vir', 'CPF', 'Telefone'],
          linhas,
          ...(comFotos ? { fotos } : {}),
        },
        procedencia: 'Cadastro de contatos da casa. Só aparece quem a equipe técnica ou a '
          + 'coordenação marcou como autorizado a visitar — estar no cadastro não basta.',
      }],
      geradoPor: user.fullName,
      cargo: cargoNoDocumento(user.role),
      assinatura: true,
      ressalva: 'Quem chegar FORA do dia ou da hora desta folha também não entra sem '
        + 'confirmação da casa — o horário é combinado com cada família, e mudá-lo é da '
        + 'equipe técnica, não da guarita. '
        + 'Quem não está nesta folha não entra sem confirmação da equipe técnica ou da '
        + 'coordenação, inclusive familiar — ligue para a casa. A folha não diz por que alguém '
        + 'não está nela, de propósito. Ela vale até ser substituída: descarte a anterior quando '
        + 'receber esta. Contém fotos, CPF e telefone de crianças e de familiares: guarde longe '
        + 'da vista de quem passa pela guarita e não fotografe.',
    };
  }

  async exportar(user: AuthenticatedUser, input: { houseId?: string; finalidade?: string }) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.houseId ?? '')) {
      throw new NotFoundException('Casa não encontrada — ou fora do seu alcance.');
    }
    const folha = await this.folha(user, input.houseId!, true);
    return this.documentos.exportar(user, folha, {
      entidade: 'portaria_visitantes', houseId: input.houseId ?? null,
      finalidade: input.finalidade ?? '',
    });
  }
}
