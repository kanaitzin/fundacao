/**
 * PORTA PÚBLICA — módulo `medications`
 * Prescrição assinada pela Enfermagem, grade de doses, confirmação individual
 * e estoque (quantidade e validade). O sistema apoia a execução segura; nunca
 * prescreve nem decide clinicamente.
 */
export { MedicationsModule } from './medications.module';
export { MedicationsService, ESTADO_DOSE, ALERTAS_MIN } from './medications.service';
