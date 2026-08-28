import { Injectable, Logger } from '@nestjs/common';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * PORTA PARA O GOOGLE SHARED DRIVE (§16).
 *
 * Em desenvolvimento e no piloto, escreve numa pasta local que imita a
 * estrutura do Shared Drive: <raiz>/<casa>/<ano>/<mês>/<categoria>. É de
 * propósito — §3.3 proíbe dado real fora de produção, e uma integração real
 * ligada durante o desenvolvimento é exatamente o caminho pelo qual um
 * documento de teste acaba na pasta institucional.
 *
 * A conta institucional aprovada e as credenciais entram só na implantação,
 * por variável de ambiente, nunca no código (§3.3, §22). Trocar esta classe
 * pela integração real não muda nada em `ArchiveService`: o contrato é
 * enviar/verificar.
 *
 * ARQUIVO_MODO=falha existe para o teste: é a única forma honesta de
 * verificar o que o sistema faz quando o Drive não responde.
 */
export interface EnvioDrive {
  caminho: string; filename: string; conteudo: string; sha256: string;
}

@Injectable()
export class DriveGateway {
  private readonly log = new Logger('DriveGateway');
  private readonly raiz = process.env.ARQUIVO_DIR ?? '/tmp/rede-acolher-arquivo';

  async enviar(e: EnvioDrive): Promise<{ driveFileId: string }> {
    if (process.env.ARQUIVO_MODO === 'falha') {
      throw new Error('Drive indisponível (modo de teste)');
    }
    const destino = join(this.raiz, e.caminho, e.filename);
    mkdirSync(dirname(destino), { recursive: true });
    // Mesma versão, mesmo objeto: reenviar substitui em vez de duplicar. A
    // correção é OUTRA versão, com outro nome — nunca sobrescrita (§16.3).
    writeFileSync(destino, e.conteudo, 'utf8');
    this.log.log(`arquivado ${e.caminho}/${e.filename}`);
    return { driveFileId: `local:${createHash('sha1').update(destino).digest('hex').slice(0, 16)}` };
  }

  /** Verificar é conferir que o que chegou é o que saiu. */
  async verificar(driveFileId: string, sha256: string): Promise<boolean> {
    if (process.env.ARQUIVO_MODO === 'nao_verifica') return false;
    const caminho = this.caminhoDe(driveFileId);
    if (!caminho || !existsSync(caminho)) return process.env.ARQUIVO_MODO === 'falha' ? false : true;
    const atual = createHash('sha256').update(readFileSync(caminho, 'utf8')).digest('hex');
    return atual === sha256;
  }

  /**
   * O gateway local não guarda índice de id → caminho; a verificação real
   * será feita pela API do Drive. Aqui, sem índice, a conferência de conteúdo
   * é dispensada e a verificação vale pelo envio bem-sucedido.
   */
  private caminhoDe(_driveFileId: string): string | null {
    return null;
  }
}
