import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../kernel/database/database.service';
import { AuthenticatedUser } from '../../kernel/contracts';
import { avaliar, avaliarDrive, TITULOS, type Evento, type Sinal } from './implantacao.regra';

/**
 * A SAÚDE DA IMPLANTAÇÃO (fase 185, ideia 9 de 30/09).
 *
 * Responde, para quem cuida das oito casas, a pergunta que hoje só se
 * responde quando a casa reclama: o que roda sozinho no servidor está
 * rodando? Cada sinal diz o estado e a frase, decididos AQUI, num lugar só,
 * para a tela e o protótipo não terem regra própria.
 *
 * Quem lê, decidido em 05/10: o Gestor Geral e a Coordenação Geral (e a conta
 * técnica, aposentada desde 01/09, se alguma ainda existir). O banco confere
 * de novo, na função.
 */
export type { Sinal, EstadoDoSinal } from './implantacao.regra';
export { avaliar, avaliarDrive } from './implantacao.regra';

@Injectable()
export class ImplantacaoService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async saude(user: AuthenticatedUser): Promise<{ agora: string; sinais: Sinal[] }> {
    /* alcance:implantacao — o banco confere de novo, na função. */
    if (!(['gestor_geral', 'admin_tecnico'].includes(user.role) || (user.role === 'coordenador' && user.todasAsCasas))) {
      throw new ForbiddenException('A saúde da implantação é do Gestor Geral e da Coordenação Geral.');
    }
    const r = await this.db.asUser(user.id, (c) => c.query('SELECT app_saude_da_implantacao() AS s'));
    const s = r.rows[0].s as { agora: string; eventos: Record<string, Evento>; drive: Parameters<typeof avaliarDrive>[0] };
    const agora = new Date(s.agora).getTime();
    const sinais: Sinal[] = TITULOS.map(([cod, titulo]) => ({ cod, titulo, ...avaliar(cod, s.eventos[cod], agora) }));
    sinais.push({ cod: 'drive', titulo: 'A fila do Drive', ...avaliarDrive(s.drive, agora) });
    return { agora: s.agora, sinais };
  }
}
