import { Global, Module } from '@nestjs/common';
import { DocumentosService } from './documentos.service';

/**
 * Global como a auditoria: quatro partições precisam gerar documento, e
 * nenhuma delas pode importar a outra. Quem sabe virar .docx é o kernel; cada
 * partição continua dona da folha do documento que é dela.
 */
@Global()
@Module({
  providers: [DocumentosService],
  exports: [DocumentosService],
})
export class DocumentosModule {}
