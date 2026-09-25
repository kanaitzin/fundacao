/**
 * NENHUM OUVINTE FALHA CALADO (fase 155).
 *
 * Roda depois de cada suíte. Se algum ouvinte do barramento falhou durante ela
 * — a notificação recusada pelo banco, o aviso que não chegou —, a suíte
 * reprova com o nome do evento e o erro.
 *
 * POR QUE ISTO EXISTE: o pedido para ler a observação restrita da ATA publicava
 * `priority: 'media'`, o banco recusava, e o barramento escrevia no log — duas
 * vezes por rodada, durante meses, com todas as suítes verdes. A resposta da
 * rota era 201 e a lista estava certa; o que faltava era o AVISO, e aviso que
 * falha não aparece em resposta nenhuma. Log que ninguém lê não é cobrança.
 *
 * Quando um teste PRECISAR provocar a falha de um ouvinte, ele esvazia a lista
 * depois de conferir que a falha aconteceu — por escrito, no próprio teste.
 */
import { falhasDeOuvinte } from '../../src/kernel/events/event-bus.service';

afterAll(() => {
  const falhas = falhasDeOuvinte.splice(0);
  if (falhas.length) {
    throw new Error(
      'Um ouvinte do barramento falhou durante esta suíte — o erro foi só para o log, '
      + 'e a pessoa que devia ser avisada não foi:\n'
      + falhas.map((f) => `  · ${f.evento}: ${f.erro}`).join('\n'));
  }
});
