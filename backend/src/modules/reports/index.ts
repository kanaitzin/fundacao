/**
 * PORTA PÚBLICA — módulo `reports`
 *
 * Acompanhamentos semanais/mensais, relatórios, aprovações e painéis.
 * Para fora, expõe o módulo e o serviço de relatórios; o resto (fontes
 * escolhidas, painel, versões) é assunto interno.
 */
export { ReportsModule } from './reports.module';
export {
  ReportsService, TIPOS_RELATORIO, SECOES_AUDIENCIA, SECOES_AUDIENCIA_OPCIONAIS,
} from './reports.service';
export { FollowupsService } from './followups.service';
