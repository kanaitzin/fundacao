import { Injectable, Logger } from '@nestjs/common';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PORTA PARA O E-MAIL INSTITUCIONAL.
 *
 * Mesmo desenho do DriveGateway (§16): em desenvolvimento e no piloto, nada
 * sai para a rede. O e-mail é escrito numa caixa local. É de propósito — um
 * envio real ligado durante o desenvolvimento é exatamente o caminho pelo qual
 * um convite de teste chega na caixa de entrada de alguém da Fundação.
 *
 * O servidor SMTP e as credenciais entram só na implantação, por variável de
 * ambiente, nunca no código (§3.3, §22). Trocar esta classe pelo envio real
 * não muda nada em `InviteService`: o contrato é enviar.
 *
 * REGRA QUE NÃO SE NEGOCIA AQUI: o log da aplicação registra que um e-mail
 * saiu, para quem e por quê — nunca o corpo, nunca o link, nunca o token.
 * O token é credencial: um log com token é uma senha em texto claro num
 * arquivo que várias pessoas leem (§3.2).
 */
export interface Mensagem {
  para: string;
  assunto: string;
  corpo: string;
}

@Injectable()
export class MailGateway {
  private readonly log = new Logger('MailGateway');
  private readonly caixa = process.env.EMAIL_DIR ?? '/tmp/rede-acolher-email';

  async enviar(m: Mensagem): Promise<{ ok: true }> {
    if (process.env.EMAIL_MODO === 'falha') {
      throw new Error('Servidor de e-mail indisponível (modo de teste)');
    }
    mkdirSync(this.caixa, { recursive: true });
    appendFileSync(
      join(this.caixa, 'caixa-de-saida.txt'),
      `\n=== ${new Date().toISOString()} ===\nPara: ${m.para}\nAssunto: ${m.assunto}\n\n${m.corpo}\n`,
      'utf8',
    );
    // Metadado, não conteúdo: destinatário e assunto bastam para investigar
    // "o convite saiu?" sem que o log vire a chave da porta.
    this.log.log(`e-mail enfileirado para ${m.para} — ${m.assunto}`);
    return { ok: true };
  }
}
