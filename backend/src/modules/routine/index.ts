/**
 * PORTA PÚBLICA — módulo `routine`
 * Rotina versionada da casa. Nenhum outro módulo precisa dela em código:
 * a geração do dia lê a rotina vigente diretamente no banco.
 */
export { RoutineModule } from './routine.module';
export { RoutineService } from './routine.service';
export type { RoutineItemInput } from './routine.service';
