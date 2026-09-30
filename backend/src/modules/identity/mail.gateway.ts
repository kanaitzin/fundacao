import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTransport, type Transporter } from 'nodemailer';

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

/*
 * OS TRÊS MODOS (`EMAIL_MODO`):
 *   arquivo — o padrão: a caixa local em `EMAIL_DIR`. Nada sai para a rede;
 *   smtp    — o envio de verdade (fase 179), com `SMTP_HOST`, `SMTP_PORT`,
 *             `SMTP_USER`, `SMTP_PASS` e `EMAIL_REMETENTE`. Sem remetente, NÃO
 *             envia: e-mail sem remetente institucional cai em spam ou é
 *             recusado, e o convite some calado;
 *   falha   — para o teste do servidor que não responde.
 *
 * STARTTLS é EXIGIDO por padrão (`SMTP_EXIGIR_TLS`): o convite leva um link
 * que é credencial, e não pode atravessar a rede em texto claro. Só o servidor
 * de captura da rede interna, no ensaio, dispensa com `SMTP_EXIGIR_TLS=nao`.
 */
@Injectable()
export class MailGateway {
  private readonly log = new Logger('MailGateway');
  private readonly caixa = process.env.EMAIL_DIR ?? '/tmp/rede-acolher-email';
  private transporte?: { chave: string; t: Transporter };

  async enviar(m: Mensagem): Promise<{ ok: true }> {
    if (process.env.EMAIL_MODO === 'falha') {
      throw new Error('Servidor de e-mail indisponível (modo de teste)');
    }
    if (process.env.EMAIL_MODO === 'smtp') return this.porSmtp(m);
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

  private async porSmtp(m: Mensagem): Promise<{ ok: true }> {
    const remetente = process.env.EMAIL_REMETENTE?.trim();
    const host = process.env.SMTP_HOST?.trim();
    if (!remetente || !host) {
      this.log.error('EMAIL_MODO=smtp sem SMTP_HOST ou EMAIL_REMETENTE: nenhum e-mail sai');
      throw new ServiceUnavailableException(
        'O envio de e-mail não está configurado neste servidor. O convite não saiu; '
        + 'avise o suporte.');
    }
    try {
      const info = await this.smtp(host).sendMail({
        from: remetente, to: m.para, subject: m.assunto, text: m.corpo,
      });
      /* O mesmo metadado do modo arquivo, e o identificador que o servidor deu:
         é o que o provedor pede para rastrear. Nunca o corpo. */
      this.log.log(`e-mail enviado para ${m.para} — ${m.assunto} · ${info.messageId}`);
      return { ok: true };
    } catch (e: any) {
      /* O código do erro, e não a mensagem inteira: a resposta do servidor
         pode repetir o endereço, e é o código que diz o que houve. */
      this.log.error(`e-mail para ${m.para} NÃO saiu · ${e?.code ?? 'sem código'} ${e?.responseCode ?? ''}`);
      throw new ServiceUnavailableException(
        'O servidor de e-mail não respondeu e o convite não saiu. Tente de novo em '
        + 'alguns minutos; se repetir, avise o suporte.');
    }
  }

  /** Um transporte por configuração: a suíte troca a porta entre um teste e outro. */
  private smtp(host: string): Transporter {
    const porta = Number(process.env.SMTP_PORT ?? 587);
    const usuario = process.env.SMTP_USER?.trim();
    const exigirTls = process.env.SMTP_EXIGIR_TLS !== 'nao';
    const chave = [host, porta, usuario ?? '', exigirTls].join('|');
    if (this.transporte?.chave !== chave) {
      this.transporte?.t.close();
      this.transporte = {
        chave,
        t: createTransport({
          host, port: porta,
          secure: porta === 465,
          requireTLS: exigirTls && porta !== 465,
          ignoreTLS: !exigirTls,
          auth: usuario ? { user: usuario, pass: process.env.SMTP_PASS ?? '' } : undefined,
          /* O e-mail é texto que o próprio sistema escreve: nada de ler
             arquivo nem endereço por conta de um campo da mensagem. */
          disableFileAccess: true,
          disableUrlAccess: true,
          connectionTimeout: 15_000,
          greetingTimeout: 10_000,
          socketTimeout: 30_000,
        }),
      };
    }
    return this.transporte.t;
  }
}
