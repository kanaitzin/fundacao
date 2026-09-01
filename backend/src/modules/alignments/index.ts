/**
 * PORTA PÚBLICA — módulo `alignments`
 *
 * Reuniões de equipe e combinados. Nenhum outro módulo depende dele em código:
 * o combinado é lido pela tela, não consumido por outro fluxo. É de propósito —
 * assim ele pode crescer (ou sair) sem mexer no turno.
 */
export { AlignmentsModule } from './alignments.module';
export { AlignmentsService } from './alignments.service';
