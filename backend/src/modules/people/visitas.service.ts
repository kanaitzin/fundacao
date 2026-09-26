import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuditService } from '../../kernel/audit/audit.service';
import { ArquivosService } from '../../kernel/arquivos/arquivos.service';
import { DocumentosService } from '../../kernel/documentos/documentos.service';
import { Folha, cargoNoDocumento } from '../../kernel/documentos/folha';
import { AuthenticatedUser } from '../../kernel/contracts';
import { maskCpf } from '../../kernel/common/cpf';
import { diasEmPortugues } from '../../kernel/common/semana';
import { hojeNaInstituicao } from '../../kernel/common/tempo';
import { ESCREVE_CONTATO, rotuloDoVinculo } from './contatos.service';

/**
 * A VISITA QUE ENTRA E SAI (fase 160).
 *
 * Até aqui o sistema sabia quem PODIA visitar (1120, 1500) e não sabia quem
 * VISITOU. Este serviço é o portão: a lista de quem pode vir hoje, a entrada
 * com o documento conferido, a saída, e a correção da visita esquecida aberta.
 *
 * DUAS DECISÕES DO HUMANO em 26/09 moram aqui:
 *
 *  * a portaria tem login MÍNIMO — ela usa a lista e registra entrada e saída,
 *    e o banco não lhe dá mais nada (identity/1591);
 *  * a contagem de uma criança existe SÓ no perfil dela, e os visitantes saem
 *    por NOME com o número ao lado — nunca "quem mais veio" (a regra passou de
 *    "nenhuma contagem por criança" a "nenhuma comparação entre crianças").
 *
 * E uma regra do §6 que as métricas não podem virar: quantidade de visitas não
 * é avaliação da família. O relatório diz o que houve, e não o que isso quer
 * dizer.
 */

/** Quem abre exceção e corrige — o mesmo que `app_abre_excecao_de_visita`. */
const ABRE_EXCECAO = ['coordenador', 'equipe_tecnica', 'lider_diurno', 'lider_noturno_geral'];

@Injectable()
export class VisitasService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ArquivosService) private readonly arquivos: ArquivosService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
  ) {}

  /** As recusas do banco, em português. */
  private traduz(e: any): never {
    const m = String(e?.message ?? '');
    if (m.includes('fora_de_escopo') || m.includes('visitante_inexistente')) {
      throw new NotFoundException('Visitante não encontrado — ou fora do seu alcance.');
    }
    if (m.includes('visita_inexistente')) throw new NotFoundException('Visita não encontrada.');
    if (m.includes('documento_obrigatorio')) {
      throw new BadRequestException('Diga qual documento foi conferido no portão (ex.: RG, CPF).');
    }
    if (m.includes('visita_ja_aberta')) {
      throw new ConflictException('Este visitante já está com uma visita aberta. Registre a saída antes.');
    }
    if (m.includes('visita_ja_encerrada')) throw new ConflictException('Esta visita já foi encerrada.');
    if (m.includes('excecao_sem_motivo:')) {
      throw new BadRequestException(`${m.split('excecao_sem_motivo:')[1].trim()} Para abrir a `
        + 'exceção, escreva o motivo (pelo menos 10 caracteres) — ele fica registrado.');
    }
    if (m.includes('fora_do_combinado:')) {
      throw new ForbiddenException(`${m.split('fora_do_combinado:')[1].trim()} A entrada fora do `
        + 'combinado só com exceção da coordenação, da equipe técnica ou do líder.');
    }
    if (m.includes('sem_permissao_corrigir_visita')) {
      throw new ForbiddenException('Corrigir uma visita é da coordenação, da equipe técnica ou do líder.');
    }
    if (m.includes('motivo_insuficiente')) {
      throw new BadRequestException('Escreva o motivo da correção (pelo menos 10 caracteres).');
    }
    if (m.includes('saida_antes_da_entrada')) {
      throw new BadRequestException('A saída não pode ser antes da entrada.');
    }
    if (m.includes('saida_no_futuro')) throw new BadRequestException('A saída não pode estar no futuro.');
    throw e;
  }

  /** A lista do portão: quem pode visitar as crianças da casa, e quem está lá dentro agora. */
  async doPortao(user: AuthenticatedUser, houseId: string) {
    const rows = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(`SELECT * FROM app_portaria_da_casa($1)`, [houseId]);
      return rows;
    }).catch((e) => this.traduz(e));
    /* O documento do visitante é de TERCEIRO: inteiro só para quem escreve no
       cadastro; no portão, os dígitos do meio — o bastante para conferir. */
    const inteiro = ESCREVE_CONTATO.includes(user.role);
    const mascara = (doc: string | null) => {
      if (!doc) return null;
      if (inteiro) return doc;
      const d = doc.replace(/\D/g, '');
      return d.length === 11 ? maskCpf(d) : `${'•'.repeat(Math.max(d.length - 3, 0))}${d.slice(-3)}`;
    };
    return {
      podeAbrirExcecao: ABRE_EXCECAO.includes(user.role),
      /* A folha em papel continua de quem responde pelo cadastro (fase 92). */
      podeGerarFolha: ESCREVE_CONTATO.includes(user.role),
      visitantes: rows.map((r: any) => ({
        contatoId: r.contact_id, nome: r.visitante, nomeSocial: r.nome_social,
        vinculoRotulo: rotuloDoVinculo(r.vinculo, r.vinculo_outro),
        cpf: mascara(r.cpf), rg: mascara(r.rg), temFoto: r.tem_foto,
        acolhido: r.acolhido,
        dias: diasEmPortugues(r.dias), de: hhmm(r.de), ate: hhmm(r.ate),
        validoDe: r.valido_de, validoAte: r.valido_ate, observacao: r.observacao,
        foraDoCombinado: r.fora_do_combinado,
        visitaAberta: r.visita_aberta ? { id: r.visita_aberta, entrouEm: r.entrou_em } : null,
      })),
    };
  }

  async fotoDoVisitante(user: AuthenticatedUser, contatoId: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [x] } = await c.query(`SELECT * FROM app_foto_do_visitante($1)`, [contatoId]);
      return x;
    }).catch((e) => this.traduz(e));
    if (!r?.storage_key) throw new NotFoundException('Este visitante ainda não tem foto.');
    const bytes = await this.arquivos.ler(r.storage_key);
    if (!bytes) throw new NotFoundException('A foto não está no armazenamento.');
    return { nome: 'visitante', tipo: r.mime, conteudo: bytes.toString('base64') };
  }

  async entrar(user: AuthenticatedUser, input: {
    contatoId?: string; documento?: string; nota?: string; excecao?: string;
  }) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [x] } = await c.query(
        `SELECT * FROM app_iniciar_visita($1, $2, $3, $4)`,
        [input.contatoId, input.documento ?? '', input.nota ?? null, input.excecao ?? null]);
      return x;
    }).catch((e) => this.traduz(e));
    return {
      id: r.visita, excecao: r.excecao,
      aviso: r.excecao
        ? 'Entrada registrada como EXCEÇÃO, com o seu motivo. Fica no histórico da visita.'
        : 'Entrada registrada, com o documento conferido e o horário.',
    };
  }

  async sair(user: AuthenticatedUser, visitaId: string, nota?: string) {
    const r = await this.db.asUser(user.id, async (c) => {
      const { rows: [x] } = await c.query(`SELECT * FROM app_encerrar_visita($1, $2)`, [visitaId, nota ?? null]);
      return x;
    }).catch((e) => this.traduz(e));
    return { saiuEm: r.saiu_em, minutos: r.minutos,
      aviso: `Saída registrada. A visita durou ${duracao(r.minutos)}.` };
  }

  async corrigir(user: AuthenticatedUser, visitaId: string, input: {
    entrada?: string; saida?: string; motivo?: string;
  }) {
    if (!ABRE_EXCECAO.includes(user.role)) {
      throw new ForbiddenException('Corrigir uma visita é da coordenação, da equipe técnica ou do líder.');
    }
    const quando = (s?: string) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null);
    if (!quando(input.entrada) || !quando(input.saida)) {
      throw new BadRequestException('Informe a entrada e a saída, com dia e hora.');
    }
    await this.db.asUser(user.id, async (c) => {
      await c.query(`SELECT * FROM app_corrigir_visita($1, $2::timestamptz, $3::timestamptz, $4)`,
        [visitaId, quando(input.entrada), quando(input.saida), input.motivo ?? '']);
    }).catch((e) => this.traduz(e));
    return { ok: true, aviso: 'Visita corrigida. O horário anterior e o motivo ficam no histórico dela.' };
  }

  /**
   * AS VISITAS DE UMA CRIANÇA — no perfil dela, e só nele.
   *
   * A contagem é desta criança (decisão de 26/09) e nunca ao lado de outra. Os
   * visitantes vêm por NOME, com quantas vezes vieram e o tempo somado: mostra
   * quem vem sem montar um ranking da família.
   */
  async daCrianca(user: AuthenticatedUser, personId: string, de?: string, ate?: string) {
    const hoje = hojeNaInstituicao();
    const fim = ate || hoje;
    const inicio = de || `${fim.slice(0, 4)}-01-01`;
    if (inicio > fim) throw new BadRequestException('O início do período vem antes do fim.');
    const linhas = await this.db.asUser(user.id, async (c) => {
      const { rows } = await c.query(
        `SELECT v.id, v.started_at, v.ended_at, v.document_checked, v.start_note, v.end_note,
                v.exception_reason, pc.name AS visitante, pc.social_name, pc.bond, pc.bond_other,
                (v.started_at AT TIME ZONE app_fuso())::date::text AS dia,
                app_user_display_name(v.started_by) AS entrada_por,
                app_user_display_name(v.ended_by) AS saida_por,
                EXISTS (SELECT 1 FROM visit_correction k WHERE k.visit_id = v.id) AS corrigida
           -- rls-join-ok (person_contact): o contato é o da própria visita, e a
           -- visita só chega aqui se a casa dela está no alcance de quem lê.
           FROM visit v JOIN person_contact pc ON pc.id = v.contact_id
          WHERE v.person_id = $1
          ORDER BY v.started_at DESC`, [personId]);
      return rows;
    });
    const minutos = (r: any) => (r.ended_at
      ? Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 60000) : null);
    const noPeriodo = linhas.filter((r: any) => r.dia >= inicio && r.dia <= fim);
    const ano = hoje.slice(0, 4);
    const semestre = Number(hoje.slice(5, 7)) <= 6 ? [`${ano}-01-01`, `${ano}-06-30`] : [`${ano}-07-01`, `${ano}-12-31`];
    const conta = (a: string, b: string) => linhas.filter((r: any) => r.dia >= a && r.dia <= b).length;

    const porVisitante = new Map<string, { nome: string; vinculo: string; visitas: number; minutos: number }>();
    for (const r of noPeriodo) {
      const nome = r.social_name || r.visitante;
      const k = `${nome}|${r.bond}`;
      const x = porVisitante.get(k) ?? { nome, vinculo: rotuloDoVinculo(r.bond, r.bond_other), visitas: 0, minutos: 0 };
      x.visitas += 1; x.minutos += minutos(r) ?? 0;
      porVisitante.set(k, x);
    }
    return {
      periodo: { de: inicio, ate: fim },
      contagem: {
        noPeriodo: noPeriodo.length,
        noMes: conta(`${hoje.slice(0, 7)}-01`, hoje),
        noSemestre: conta(semestre[0], semestre[1]),
        noAno: conta(`${ano}-01-01`, `${ano}-12-31`),
        total: linhas.length,
      },
      /* Por NOME, nunca por total (decisão de 26/09). */
      visitantes: [...porVisitante.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      visitas: noPeriodo.map((r: any) => ({
        id: r.id, visitante: r.social_name || r.visitante,
        vinculoRotulo: rotuloDoVinculo(r.bond, r.bond_other),
        entrouEm: r.started_at, saiuEm: r.ended_at, minutos: minutos(r),
        documento: r.document_checked, entradaPor: r.entrada_por, saidaPor: r.saida_por,
        observacaoEntrada: r.start_note, observacaoSaida: r.end_note,
        excecao: r.exception_reason, corrigida: r.corrigida,
        aberta: !r.ended_at,
      })),
      aviso: 'Quantidade de visitas não é avaliação da família: o número diz o que houve, '
        + 'e não o que isso quer dizer.',
    };
  }

  /** O relatório das visitas de uma criança, num período — em Word, com finalidade. */
  async exportar(user: AuthenticatedUser, personId: string, input: {
    de?: string; ate?: string; finalidade?: string;
  }) {
    const d = await this.daCrianca(user, personId, input.de, input.ate);
    const casa = await this.audit.casaDoAcolhido(user.id, personId);
    const nome = await this.db.asUser(user.id, async (c) => {
      const { rows: [p] } = await c.query(`SELECT app_person_display_name($1) AS n`, [personId]);
      return p?.n as string | null;
    });
    if (!nome) throw new NotFoundException('Acolhido não encontrado — ou fora do seu alcance.');
    const dia = (iso: string) => iso.split('-').reverse().join('/');
    const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }) : '—');
    const folha: Folha = {
      titulo: 'Relatório de visitas',
      subtitulo: nome,
      identificacao: [
        { rotulo: 'Período', valor: `${dia(d.periodo.de)} a ${dia(d.periodo.ate)}` },
        { rotulo: 'Visitas no período', valor: String(d.contagem.noPeriodo) },
      ],
      secoes: [
        {
          titulo: 'Quem visitou',
          tabela: {
            cabecalho: ['Visitante', 'Vínculo', 'Visitas', 'Tempo somado'],
            linhas: d.visitantes.map((v) => [v.nome, v.vinculo, String(v.visitas), duracao(v.minutos)]),
          },
        },
        {
          titulo: 'As visitas, uma a uma',
          tabela: {
            cabecalho: ['Visitante', 'Entrada', 'Saída', 'Duração', 'Registrou'],
            linhas: d.visitas.slice().reverse().map((v) => [
              v.visitante, hora(v.entrouEm), hora(v.saiuEm),
              v.minutos == null ? 'aberta' : duracao(v.minutos), v.entradaPor ?? '—',
            ]),
          },
        },
      ],
      geradoPor: user.fullName,
      cargo: cargoNoDocumento(user.role),
      assinatura: true,
      ressalva: d.aviso,
    };
    return this.documentos.exportar(user, folha, {
      entidade: 'visit_report', entidadeId: personId, houseId: casa,
      finalidade: input.finalidade ?? '',
    });
  }
}

const hhmm = (t: string | null) => (t ? String(t).slice(0, 5) : null);

function duracao(min: number): string {
  if (!min) return '0 min';
  const h = Math.floor(min / 60); const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}
